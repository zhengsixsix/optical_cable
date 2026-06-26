import { computed, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type {
  ComponentModelParamsConfig,
  ComponentSpec,
  FiberModelParamsConfig,
  FiberSpec,
} from '@/types/useFile'
import { deviceValueListToMap } from '@/services/platform/deviceAttributes'
import { findDeviceLibraryById } from '@/services/platform/deviceRuntime'

export interface DerivedInstanceInfo {
  derivedId: string
  sourceId: string
  derivedAt: string
  modifiedFields: string[]
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object' || a === null || b === null) return false

  const keysA = Object.keys(a as Record<string, unknown>)
  const keysB = Object.keys(b as Record<string, unknown>)
  if (keysA.length !== keysB.length) return false

  const objA = a as Record<string, unknown>
  const objB = b as Record<string, unknown>
  return keysA.every(key => deepEqual(objA[key], objB[key]))
}

function findDifferentFields(original: Record<string, unknown>, modified: Record<string, unknown>): string[] {
  const fields = new Set([...Object.keys(original), ...Object.keys(modified)])
  return Array.from(fields).filter(field => !deepEqual(original[field], modified[field]))
}

function generateDerivedId(sourceId: string): string {
  return `${sourceId}_derived_${Date.now()}`
}

export function isDerivedInstance(id: string): boolean {
  return id.includes('_derived_')
}

export function getSourceIdFromDerived(derivedId: string): string | null {
  if (!isDerivedInstance(derivedId)) return null
  const match = derivedId.match(/^(.+)_derived_\d+$/)
  return match ? match[1] : null
}

export function useDerivedDevice() {
  const settingsStore = useSettingsStore()
  const derivedInstances = ref<Map<string, DerivedInstanceInfo>>(new Map())

  const findSourceLibrary = (id: string, category?: 'fiber' | 'amplifier' | 'branching') =>
    findDeviceLibraryById(settingsStore.platformDeviceLibraries, id, category)

  function isComponentModified(
    componentId: string,
    currentParams: Record<string, ComponentModelParamsConfig>,
  ): boolean {
    const compareId = getSourceIdFromDerived(componentId) || componentId
    const library = findSourceLibrary(compareId, 'amplifier') || findSourceLibrary(compareId, 'branching')
    if (!library) return false
    return !deepEqual(deviceValueListToMap(library.deviceValueList), currentParams)
  }

  function isFiberModified(
    fiberId: string,
    currentParams: Record<string, FiberModelParamsConfig>,
  ): boolean {
    const compareId = getSourceIdFromDerived(fiberId) || fiberId
    const library = findSourceLibrary(compareId, 'fiber')
    if (!library) return false
    return !deepEqual(deviceValueListToMap(library.deviceValueList), currentParams)
  }

  function createDerivedComponent(
    sourceId: string,
    modifiedSpecs: Partial<ComponentSpec>,
    modifiedModelParams: Record<string, ComponentModelParamsConfig>,
  ): string {
    const library = findSourceLibrary(sourceId, 'amplifier') || findSourceLibrary(sourceId, 'branching')
    if (!library) return sourceId

    const baseValues = deviceValueListToMap(library.deviceValueList)
    const specFields = findDifferentFields(baseValues, modifiedSpecs as Record<string, unknown>)
    const paramFields = findDifferentFields(baseValues, modifiedModelParams)
    const modifiedFields = Array.from(new Set([...specFields, ...paramFields.map(field => `model_params.${field}`)]))
    if (modifiedFields.length === 0) return sourceId

    const derivedId = generateDerivedId(sourceId)
    derivedInstances.value.set(derivedId, {
      derivedId,
      sourceId,
      derivedAt: new Date().toISOString(),
      modifiedFields,
    })
    return derivedId
  }

  function createDerivedFiber(
    sourceId: string,
    modifiedAttributes: Partial<FiberSpec['attributes']>,
    modifiedModelParams: Record<string, FiberModelParamsConfig>,
  ): string {
    const library = findSourceLibrary(sourceId, 'fiber')
    if (!library) return sourceId

    const baseValues = deviceValueListToMap(library.deviceValueList)
    const attrFields = findDifferentFields(baseValues, modifiedAttributes as Record<string, unknown>)
    const paramFields = findDifferentFields(baseValues, modifiedModelParams)
    const modifiedFields = Array.from(new Set([...attrFields, ...paramFields.map(field => `model_params.${field}`)]))
    if (modifiedFields.length === 0) return sourceId

    const derivedId = generateDerivedId(sourceId)
    derivedInstances.value.set(derivedId, {
      derivedId,
      sourceId,
      derivedAt: new Date().toISOString(),
      modifiedFields,
    })
    return derivedId
  }

  function getDerivedInfo(derivedId: string): DerivedInstanceInfo | undefined {
    return derivedInstances.value.get(derivedId)
  }

  function hasDerivedInstances(sourceId: string): boolean {
    return Array.from(derivedInstances.value.values()).some(info => info.sourceId === sourceId)
  }

  function getDerivedInstancesOf(sourceId: string): DerivedInstanceInfo[] {
    return Array.from(derivedInstances.value.values()).filter(info => info.sourceId === sourceId)
  }

  return {
    derivedInstances: computed(() => derivedInstances.value),
    isDerivedInstance,
    getSourceIdFromDerived,
    isComponentModified,
    isFiberModified,
    hasDerivedInstances,
    createDerivedComponent,
    createDerivedFiber,
    getDerivedInfo,
    getDerivedInstancesOf,
  }
}
