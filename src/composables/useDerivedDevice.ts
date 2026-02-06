/**
 * 派生设备实例管理 Composable
 * 
 * 当用户修改器件参数偏离库默认值时，需要创建派生实例而非直接修改原实例。
 * 这确保了器件库的完整性，同时允许用户自定义参数。
 * 
 * 派生实例的命名规则：{原始ID}_derived_{timestamp}
 * 派生实例会记录其源实例的引用
 */

import { ref, computed } from 'vue'
import { useSettingsStore } from '@/stores'
import type { 
  ComponentSpec, 
  FiberSpec, 
  ComponentModelParamsConfig,
  FiberModelParamsConfig 
} from '@/types/useFile'

export interface DerivedInstanceInfo {
  /** 派生实例 ID */
  derivedId: string
  /** 源实例 ID */
  sourceId: string
  /** 派生时间 */
  derivedAt: string
  /** 修改的参数字段 */
  modifiedFields: string[]
}

/**
 * 检查两个对象的值是否相等 (深度比较)
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object' || a === null || b === null) return false
  
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  
  if (keysA.length !== keysB.length) return false
  
  return keysA.every(key => deepEqual(a[key], b[key]))
}

/**
 * 比较两个对象，返回不同的字段名
 */
function findDifferentFields(original: Record<string, any>, modified: Record<string, any>): string[] {
  const allKeys = new Set([...Object.keys(original), ...Object.keys(modified)])
  const differentFields: string[] = []
  
  allKeys.forEach(key => {
    if (!deepEqual(original[key], modified[key])) {
      differentFields.push(key)
    }
  })
  
  return differentFields
}

/**
 * 生成派生实例 ID
 */
function generateDerivedId(sourceId: string): string {
  const timestamp = Date.now()
  return `${sourceId}_derived_${timestamp}`
}

/**
 * 检查 ID 是否为派生实例
 */
export function isDerivedInstance(id: string): boolean {
  return id.includes('_derived_')
}

/**
 * 从派生实例 ID 提取源实例 ID
 */
export function getSourceIdFromDerived(derivedId: string): string | null {
  if (!isDerivedInstance(derivedId)) return null
  const match = derivedId.match(/^(.+)_derived_\d+$/)
  return match ? match[1] : null
}

/**
 * 派生设备实例管理 Composable
 */
export function useDerivedDevice() {
  const settingsStore = useSettingsStore()
  
  // 派生实例记录
  const derivedInstances = ref<Map<string, DerivedInstanceInfo>>(new Map())
  
  /**
   * 检查器件参数是否已被修改 (相对于库默认值)
   */
  function isComponentModified(
    componentId: string, 
    currentParams: Record<string, ComponentModelParamsConfig>
  ): boolean {
    // 如果是派生实例，比较与源实例
    const sourceId = getSourceIdFromDerived(componentId)
    const compareId = sourceId || componentId
    
    // 从器件库获取原始规格
    const originalSpec = settingsStore.amplifierTypes.find(a => a.id === compareId) ||
                         settingsStore.branchingUnitTypes.find(b => b.id === compareId)
    
    if (!originalSpec) return false
    
    // 比较 model_params
    const originalParams = (originalSpec as any).model_params || {}
    return !deepEqual(originalParams, currentParams)
  }
  
  /**
   * 检查光纤参数是否已被修改
   */
  function isFiberModified(
    fiberId: string,
    currentParams: Record<string, FiberModelParamsConfig>
  ): boolean {
    const sourceId = getSourceIdFromDerived(fiberId)
    const compareId = sourceId || fiberId
    
    const originalSpec = settingsStore.fiberTypes.find(f => f.id === compareId)
    if (!originalSpec) return false
    
    const originalParams = (originalSpec as any).model_params || {}
    return !deepEqual(originalParams, currentParams)
  }
  
  /**
   * 创建器件的派生实例
   * 返回新实例的 ID，如果无需派生则返回原 ID
   */
  function createDerivedComponent(
    sourceId: string,
    modifiedSpecs: Partial<ComponentSpec>,
    modifiedModelParams: Record<string, ComponentModelParamsConfig>
  ): string {
    // 检查是否真的有修改
    const originalSpec = settingsStore.amplifierTypes.find(a => a.id === sourceId) ||
                         settingsStore.branchingUnitTypes.find(b => b.id === sourceId)
    
    if (!originalSpec) {
      console.warn(`Cannot find source component: ${sourceId}`)
      return sourceId
    }
    
    // 找出修改的字段
    const specFields = findDifferentFields(originalSpec, modifiedSpecs)
    const paramFields = findDifferentFields((originalSpec as any).model_params || {}, modifiedModelParams)
    const allModifiedFields = [...specFields, ...paramFields.map(f => `model_params.${f}`)]
    
    // 如果没有修改，返回原 ID
    if (allModifiedFields.length === 0) {
      return sourceId
    }
    
    // 生成派生实例 ID
    const derivedId = generateDerivedId(sourceId)
    const derivedName = `${originalSpec.name} [派生]`
    
    // 记录派生信息
    derivedInstances.value.set(derivedId, {
      derivedId,
      sourceId,
      derivedAt: new Date().toISOString(),
      modifiedFields: allModifiedFields
    })
    
    // 添加到器件库 (根据器件库的类型判断)
    // 检查是否是放大器类型
    const isAmplifier = settingsStore.amplifierTypes.some(a => a.id === sourceId)
    if (isAmplifier) {
      const ampSpec = originalSpec as any
      settingsStore.addAmplifierType({
        id: derivedId,
        name: derivedName,
        gain: ampSpec.gain || 16,
        noiseFigure: ampSpec.noiseFigure || 5,
        maxOutputPower: ampSpec.maxOutputPower || 20,
        bandwidth: ampSpec.bandwidth || 35,
        gainFlatness: ampSpec.gainFlatness || 0.5,
        pumpPower: ampSpec.pumpPower || 500,
        outputPower: ampSpec.outputPower || 17,
        gainRangePower: ampSpec.gainRangePower || 3,
        sourceRef: sourceId
      } as any)
    } else {
      // 分支器类型
      const buSpec = originalSpec as any
      settingsStore.addBranchingUnitType({
        id: derivedId,
        name: derivedName,
        portCount: buSpec.portCount || 3,
        trunkInsertionLoss: buSpec.trunkInsertionLoss || 0.8,
        branchInsertionLoss: buSpec.branchInsertionLoss || 3.5,
        insertionLoss: buSpec.insertionLoss || 0.8,
        wavelengthRange: buSpec.wavelengthRange || 35,
        sourceRef: sourceId
      } as any)
    }
    
    return derivedId
  }
  
  /**
   * 创建光纤的派生实例
   */
  function createDerivedFiber(
    sourceId: string,
    modifiedAttributes: Partial<FiberSpec['attributes']>,
    modifiedModelParams: Record<string, FiberModelParamsConfig>
  ): string {
    const originalSpec = settingsStore.fiberTypes.find(f => f.id === sourceId)
    
    if (!originalSpec) {
      console.warn(`Cannot find source fiber: ${sourceId}`)
      return sourceId
    }
    
    // 找出修改的字段
    const attrFields = findDifferentFields(originalSpec as any, modifiedAttributes)
    const paramFields = findDifferentFields((originalSpec as any).model_params || {}, modifiedModelParams)
    const allModifiedFields = [...attrFields, ...paramFields.map(f => `model_params.${f}`)]
    
    if (allModifiedFields.length === 0) {
      return sourceId
    }
    
    const derivedId = generateDerivedId(sourceId)
    
    // 记录派生信息
    derivedInstances.value.set(derivedId, {
      derivedId,
      sourceId,
      derivedAt: new Date().toISOString(),
      modifiedFields: allModifiedFields
    })
    
    // 添加到器件库
    settingsStore.addFiberType({
      id: derivedId,
      name: `${originalSpec.name} [派生]`,
      attenuation: modifiedAttributes.attenuation ?? (originalSpec as any).attenuation ?? 0.16,
      dispersion: modifiedAttributes.dispersion ?? (originalSpec as any).dispersion ?? 17,
      effectiveArea: modifiedAttributes.A_eff ?? (originalSpec as any).effectiveArea ?? 80,
      nonlinearCoeff: modifiedAttributes.n2 ?? (originalSpec as any).nonlinearCoeff ?? 1.3,
      sourceRef: sourceId
    } as any)
    
    return derivedId
  }
  
  /**
   * 获取派生实例信息
   */
  function getDerivedInfo(derivedId: string): DerivedInstanceInfo | undefined {
    return derivedInstances.value.get(derivedId)
  }
  
  /**
   * 检查器件是否有派生实例
   */
  function hasDerivedInstances(sourceId: string): boolean {
    for (const [, info] of derivedInstances.value) {
      if (info.sourceId === sourceId) {
        return true
      }
    }
    return false
  }
  
  /**
   * 获取某个源实例的所有派生实例
   */
  function getDerivedInstancesOf(sourceId: string): DerivedInstanceInfo[] {
    const result: DerivedInstanceInfo[] = []
    for (const [, info] of derivedInstances.value) {
      if (info.sourceId === sourceId) {
        result.push(info)
      }
    }
    return result
  }
  
  return {
    // 状态
    derivedInstances: computed(() => derivedInstances.value),
    
    // 检查函数
    isDerivedInstance,
    getSourceIdFromDerived,
    isComponentModified,
    isFiberModified,
    hasDerivedInstances,
    
    // 创建派生
    createDerivedComponent,
    createDerivedFiber,
    
    // 查询
    getDerivedInfo,
    getDerivedInstancesOf
  }
}
