import type { PlatformBindFunc } from './types'

export type BindFuncParamValueType = 'string' | 'number' | 'boolean' | 'json' | 'field'

export interface BindFuncFieldParamValue {
  type: 'FIELD'
  value: string
}

export interface BindFuncParamDraft {
  rowId: string
  key: string
  valueType: BindFuncParamValueType
  value: string
}

export interface BindFuncDraft {
  rowId: string
  name: string
  isDefault: boolean
  expanded: boolean
  params: BindFuncParamDraft[]
}

type NextDraftId = (prefix: 'func' | 'param') => string

export function createBindFuncDraft(nextId: NextDraftId): BindFuncDraft {
  return {
    rowId: nextId('func'),
    name: '',
    isDefault: false,
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
  if (isFieldParamValue(value)) return 'field'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string') return 'string'
  return 'json'
}

function stringifyParamValue(value: unknown): string {
  if (isFieldParamValue(value)) return value.value
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

function isFieldParamValue(value: unknown): value is BindFuncFieldParamValue {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).type === 'FIELD' &&
    typeof (value as Record<string, unknown>).value === 'string',
  )
}

export function bindFuncListToDrafts(
  bindFuncList: PlatformBindFunc[] | null | undefined,
  nextId: NextDraftId,
): BindFuncDraft[] {
  return (bindFuncList ?? []).map(bindFunc => ({
    rowId: nextId('func'),
    name: bindFunc.name ?? '',
    isDefault: Number(bindFunc.isDefault ?? 0) === 1,
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

  if (param.valueType === 'field') {
    if (!value) {
      throw new Error(`参数 ${key} 必须填写动态属性编码`)
    }
    return { type: 'FIELD', value }
  }

  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`参数 ${key} 必须是合法 JSON`)
  }
}

export function bindFuncDraftsToList(drafts: BindFuncDraft[]): PlatformBindFunc[] {
  const bindFuncList: PlatformBindFunc[] = []
  const firstDefaultIndex = drafts.findIndex(draft => draft.isDefault && draft.name.trim())

  drafts.forEach((draft, draftIndex) => {
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

    bindFuncList.push({
      name,
      isDefault: draftIndex === firstDefaultIndex ? 1 : 0,
      defaultInputParams,
    })
  })

  return bindFuncList
}
