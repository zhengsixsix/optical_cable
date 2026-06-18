import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  bindFuncDraftsToList,
  bindFuncListToDrafts,
  createBindFuncDraft,
  createBindFuncParamDraft,
} from '@/services/platform/bindFuncForm'

describe('platform bind function form helpers', () => {
  it('builds multiple bind functions with typed child params', () => {
    const result = bindFuncDraftsToList([
      {
        rowId: 'func-1',
        name: ' FUNC_SENSOR_COLLECT_DATA ',
        expanded: true,
        params: [
          { rowId: 'param-1', key: 'interval', valueType: 'number', value: '30' },
          { rowId: 'param-2', key: 'enabled', valueType: 'boolean', value: 'true' },
          { rowId: 'param-3', key: 'tags', valueType: 'json', value: '["sensor","fiber"]' },
          { rowId: 'param-4', key: '', valueType: 'string', value: '' },
        ],
      },
      {
        rowId: 'func-2',
        name: '',
        expanded: true,
        params: [],
      },
    ])

    expect(result).toEqual([
      {
        name: 'FUNC_SENSOR_COLLECT_DATA',
        defaultInputParams: {
          interval: 30,
          enabled: true,
          tags: ['sensor', 'fiber'],
        },
      },
    ])
  })

  it('restores platform bind functions into editable rows', () => {
    let sequence = 0
    const nextId = (prefix: 'func' | 'param') => `${prefix}-${++sequence}`

    const drafts = bindFuncListToDrafts([
      {
        name: 'FUNC_INIT',
        defaultInputParams: {
          retries: 3,
          active: false,
          profile: { mode: 'auto' },
          label: 'main',
        },
      },
    ], nextId)

    expect(drafts).toEqual([
      {
        rowId: 'func-1',
        name: 'FUNC_INIT',
        expanded: true,
        params: [
          { rowId: 'param-2', key: 'retries', valueType: 'number', value: '3' },
          { rowId: 'param-3', key: 'active', valueType: 'boolean', value: 'false' },
          { rowId: 'param-4', key: 'profile', valueType: 'json', value: '{\n  "mode": "auto"\n}' },
          { rowId: 'param-5', key: 'label', valueType: 'string', value: 'main' },
        ],
      },
    ])
  })

  it('creates expanded rows for the add interaction', () => {
    expect(createBindFuncDraft(() => 'func-new')).toEqual({
      rowId: 'func-new',
      name: '',
      expanded: true,
      params: [],
    })
    expect(createBindFuncParamDraft(() => 'param-new')).toEqual({
      rowId: 'param-new',
      key: '',
      valueType: 'string',
      value: '',
    })
  })

  it('rejects invalid child param values before saving', () => {
    expect(() => bindFuncDraftsToList([
      {
        rowId: 'func-1',
        name: 'FUNC_BAD',
        expanded: true,
        params: [
          { rowId: 'param-1', key: 'interval', valueType: 'number', value: 'abc' },
        ],
      },
    ])).toThrow('interval')
  })
})

describe('platform device settings dialog source', () => {
  it('uses upload and map picking instead of raw icon/project/sort fields', () => {
    const settingsSource = readFileSync(fileURLToPath(new URL('../views/SettingsView.vue', import.meta.url)), 'utf8')
    const dialogStart = settingsSource.indexOf('<!-- 器件库弹窗 -->')
    const dialogSource = settingsSource.slice(dialogStart)

    expect(dialogSource).toContain('上传图标')
    expect(dialogSource).toContain('handlePlatformEntityMapSelect')
    expect(dialogSource).toContain('地图选点')
    expect(dialogSource).toContain('项目名称')
    expect(dialogSource).not.toContain('图标附件 ID')
    expect(dialogSource).not.toContain('项目 ID')
    expect(dialogSource).not.toContain('排序')
  })

  it('does not render a separate name label inside bind function rows', () => {
    const editorSource = readFileSync(fileURLToPath(new URL('../components/settings/BindFuncListEditor.vue', import.meta.url)), 'utf8')

    expect(editorSource).not.toContain('>name</label>')
    expect(editorSource).toContain('placeholder="绑定函数 name，如 FUNC_SENSOR_COLLECT_DATA"')
  })
})
