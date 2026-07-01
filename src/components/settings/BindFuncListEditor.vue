<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-vue-next'
import { Button, Input, Select } from '@/shared/components/base'
import {
  createBindFuncDraft,
  createBindFuncParamDraft,
  type BindFuncDraft,
  type BindFuncParamValueType,
} from '@/services/platform/bindFuncForm'

const props = defineProps<{
  modelValue: BindFuncDraft[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: BindFuncDraft[]): void
}>()

const valueTypeOptions = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'field', label: 'FIELD' },
  { value: 'json', label: 'JSON' },
]

let draftSequence = 0

const nextDraftId = (prefix: 'func' | 'param') => `${prefix}-${Date.now()}-${++draftSequence}`
const drafts = computed(() => props.modelValue ?? [])

const emitDrafts = (value: BindFuncDraft[]) => {
  emit('update:modelValue', value)
}

const updateFunc = (funcIndex: number, patch: Partial<BindFuncDraft>) => {
  emitDrafts(drafts.value.map((item, index) => (
    index === funcIndex ? { ...item, ...patch } : item
  )))
}

const setDefaultFunc = (funcIndex: number) => {
  emitDrafts(drafts.value.map((item, index) => ({
    ...item,
    isDefault: index === funcIndex,
  })))
}

const updateParam = (
  funcIndex: number,
  paramIndex: number,
  patch: Partial<BindFuncDraft['params'][number]>,
) => {
  emitDrafts(drafts.value.map((func, index) => {
    if (index !== funcIndex) return func
    return {
      ...func,
      params: func.params.map((param, paramCurrentIndex) => (
        paramCurrentIndex === paramIndex ? { ...param, ...patch } : param
      )),
    }
  }))
}

const addFunc = () => {
  emitDrafts([...drafts.value, createBindFuncDraft(nextDraftId)])
}

const removeFunc = (funcIndex: number) => {
  emitDrafts(drafts.value.filter((_, index) => index !== funcIndex))
}

const addParam = (funcIndex: number) => {
  emitDrafts(drafts.value.map((func, index) => (
    index === funcIndex
      ? { ...func, expanded: true, params: [...func.params, createBindFuncParamDraft(nextDraftId)] }
      : func
  )))
}

const removeParam = (funcIndex: number, paramIndex: number) => {
  emitDrafts(drafts.value.map((func, index) => (
    index === funcIndex
      ? { ...func, params: func.params.filter((_, currentIndex) => currentIndex !== paramIndex) }
      : func
  )))
}

const valuePlaceholder = (type: BindFuncParamValueType) => {
  if (type === 'number') return '如 30'
  if (type === 'boolean') return 'true / false'
  if (type === 'field') return '参数编码，如 attenuation'
  if (type === 'json') return '{"key":"value"}'
  return '参数值'
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">功能配置</h4>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          从器件库带出的功能可继续调整，保存时会随接线元一起提交。
        </p>
      </div>
      <Button variant="outline" size="sm" class="shrink-0" @click="addFunc">
        <Plus class="w-4 h-4 mr-1" />
        添加功能
      </Button>
    </div>

    <div
      v-if="drafts.length === 0"
      class="rounded-md border border-dashed px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500"
      style="border-color: var(--app-border-color)"
    >
      暂无功能配置，可按需添加。
    </div>

    <div
      v-for="(func, funcIndex) in drafts"
      :key="func.rowId"
      class="overflow-hidden rounded-md border bg-white dark:bg-gray-900"
      style="border-color: var(--app-border-color)"
    >
      <div class="flex items-center gap-3 px-3 py-3 bg-gray-50 dark:bg-white/5">
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-white dark:hover:bg-gray-800"
          :title="func.expanded ? '收起参数' : '展开参数'"
          @click="updateFunc(funcIndex, { expanded: !func.expanded })"
        >
          <ChevronDown v-if="func.expanded" class="h-4 w-4 text-gray-500" />
          <ChevronRight v-else class="h-4 w-4 text-gray-500" />
        </button>
        <div class="min-w-0 flex-1">
          <Input
            :model-value="func.name"
            placeholder="功能标识，如 FUNC_SENSOR_COLLECT_DATA"
            @update:model-value="value => updateFunc(funcIndex, { name: String(value) })"
          />
        </div>
        <label class="inline-flex shrink-0 items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
          <input
            type="radio"
            class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
            :checked="func.isDefault"
            name="default-bind-func"
            @change="setDefaultFunc(funcIndex)"
          />
          默认功能
        </label>
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-red-500 hover:bg-red-50 hover:text-red-600"
          title="删除功能"
          @click="removeFunc(funcIndex)"
        >
          <Trash2 class="h-4 w-4" />
        </button>
      </div>

      <div v-if="func.expanded" class="space-y-3 border-t px-3 py-3" style="border-color: var(--app-border-color)">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400">默认入参</span>
          <Button variant="outline" size="sm" @click="addParam(funcIndex)">
            <Plus class="w-4 h-4 mr-1" />
            添加入参
          </Button>
        </div>

        <div
          v-if="func.params.length === 0"
          class="rounded-md bg-gray-50 px-3 py-4 text-center text-xs text-gray-400 dark:bg-white/5 dark:text-gray-500"
        >
          当前功能暂无默认入参。
        </div>

        <div v-else class="space-y-2">
          <div class="grid grid-cols-[minmax(150px,1fr)_120px_minmax(180px,1.3fr)_36px] gap-2 text-xs text-gray-500">
            <span>入参名</span>
            <span>类型</span>
            <span>值</span>
            <span></span>
          </div>
          <div
            v-for="(param, paramIndex) in func.params"
            :key="param.rowId"
            class="grid grid-cols-[minmax(150px,1fr)_120px_minmax(180px,1.3fr)_36px] items-center gap-2"
          >
            <Input
              :model-value="param.key"
              placeholder="如 interval"
              @update:model-value="value => updateParam(funcIndex, paramIndex, { key: String(value) })"
            />
            <Select
              :model-value="param.valueType"
              :options="valueTypeOptions"
              @update:model-value="value => updateParam(funcIndex, paramIndex, { valueType: value as BindFuncParamValueType })"
            />
            <Input
              :model-value="param.value"
              :placeholder="valuePlaceholder(param.valueType)"
              @update:model-value="value => updateParam(funcIndex, paramIndex, { value: String(value) })"
            />
            <button
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded text-red-500 hover:bg-red-50 hover:text-red-600"
              title="删除子级参数"
              @click="removeParam(funcIndex, paramIndex)"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
