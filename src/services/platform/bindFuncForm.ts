import type { PlatformBindFunc } from './types'

export type BindFuncParamValueType = 'string' | 'number' | 'boolean' | 'json'

export interface BindFuncParamDraft {
  rowId: string
  key: string
  valueType: BindFuncParamValueType
  value: string
}

export interface BindFuncDraft {
  rowId: string
  name: string
  expanded: boolean
  params: BindFuncParamDraft[]
}

type NextDraftId = (prefix: 'func' | 'param') => string

export function createBindFuncDraft(nextId: NextDraftId): BindFuncDraft {
  return {
    rowId: nextId('func'),
    name: '',
    expanded: true,
    params: [],
  }
}

export function createBindFuncParamDraft(nextId: NextDraftId): BindFuncParamDraft {
  return {
    rowId: nextId('param'),
    key: '',
    valueType: 'string',
    value: '',
  }
}

function getValueType(value: unknown): BindFuncParamValueType {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string') return 'string'
  return 'json'
}

function stringifyParamValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

export function bindFuncListToDrafts(
  bindFuncList: PlatformBindFunc[] | null | undefined,
  nextId: NextDraftId,
): BindFuncDraft[] {
  return (bindFuncList ?? []).map(bindFunc => ({
    rowId: nextId('func'),
    name: bindFunc.name ?? '',
    expanded: true,
    params: Object.entries(bindFunc.defaultInputParams ?? {}).map(([key, value]) => ({
      rowId: nextId('param'),
      key,
      valueType: getValueType(value),
      value: stringifyParamValue(value),
    })),
  }))
}

function parseParamValue(param: BindFuncParamDraft): unknown {
  const key = param.key.trim()
  const value = param.value.trim()

  if (param.valueType === 'string') return param.value

  if (param.valueType === 'number') {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      throw new Error(`参数 ${key} 必须是数字`)
    }
    return numeric
  }

  if (param.valueType === 'boolean') {
    const normalized = value.toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
    throw new Error(`参数 ${key} 必须是 true 或 false`)
  }

  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`参数 ${key} 必须是合法 JSON`)
  }
}

export function bindFuncDraftsToList(drafts: BindFuncDraft[]): PlatformBindFunc[] {
  const bindFuncList: PlatformBindFunc[] = []

  drafts.forEach(draft => {
    const name = draft.name.trim()
    if (!name) return

    const defaultInputParams: Record<string, unknown> = {}
    const usedKeys = new Set<string>()

    draft.params.forEach(param => {
      const key = param.key.trim()
      if (!key) return
      if (usedKeys.has(key)) {
        throw new Error(`参数 ${key} 重复`)
      }
      usedKeys.add(key)
      defaultInputParams[key] = parseParamValue(param)
    })

    bindFuncList.push({ name, defaultInputParams })
  })

  return bindFuncList
}
