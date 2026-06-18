<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { BookOpen, RefreshCw, Save, Trash2, X } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { Button, Input, Select } from '@/shared/components/base'
import { platformDictionaryApi } from '@/services/platform/api'
import type { PlatformDictionary } from '@/services/platform/types'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const appStore = useAppStore()
const isLoading = ref(false)
const dictionaryType = ref('PLAN_TYPE')
const dictionaries = ref<PlatformDictionary[]>([])
const selectableItems = ref<PlatformDictionary[]>([])
const form = reactive({ id: '', type: 'PLAN_TYPE', code: '', name: '', detail: '', sortNum: 999, isValidCd: '1' })

const typeOptions = [
  { value: 'PLAN_TYPE', label: '项目类型' },
  { value: 'LAYER_TYPE', label: '图层分类' },
  { value: 'REGISTER_APPROVAL', label: '注册审批状态' },
  { value: 'IS_VALID', label: '启用状态' },
]

function resetForm() {
  Object.assign(form, { id: '', type: dictionaryType.value, code: '', name: '', detail: '', sortNum: 999, isValidCd: '1' })
}

function editItem(item: PlatformDictionary) {
  Object.assign(form, {
    id: item.id ?? '',
    type: item.type ?? dictionaryType.value,
    code: item.code ?? '',
    name: item.name ?? '',
    detail: item.detail ?? '',
    sortNum: item.sortNum ?? 999,
    isValidCd: item.isValidCd ?? '1',
  })
}

async function loadData() {
  isLoading.value = true
  try {
    form.type = dictionaryType.value
    const [list, items] = await Promise.all([
      platformDictionaryApi.search({ pageNumber: 1, pageSize: 100, type: dictionaryType.value }),
      platformDictionaryApi.listItem(dictionaryType.value),
    ])
    dictionaries.value = list.data ?? []
    selectableItems.value = items ?? []
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `字典加载失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

async function saveItem() {
  if (!form.code.trim() || !form.name.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入字典编码和名称' })
    return
  }
  isLoading.value = true
  try {
    await platformDictionaryApi.save({ ...form, id: form.id || null })
    appStore.showNotification({ type: 'success', message: '字典项已保存' })
    resetForm()
    await loadData()
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `保存字典失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

async function removeItem(item: PlatformDictionary) {
  if (!item.id || !item.type || !confirm(`确定删除「${item.name || item.code}」吗？`)) return
  isLoading.value = true
  try {
    await platformDictionaryApi.remove({ id: item.id, type: item.type })
    appStore.showNotification({ type: 'success', message: '字典项已删除' })
    await loadData()
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `删除字典失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

watch(() => props.visible, visible => {
  if (!visible) return
  resetForm()
  loadData()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center" @click.self="emit('close')">
      <div class="w-[960px] max-w-[calc(100vw-32px)] max-h-[86vh] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <header class="h-14 px-5 border-b flex items-center justify-between">
          <div class="flex items-center gap-2">
            <BookOpen class="w-5 h-5 text-blue-600" />
            <div>
              <div class="font-semibold text-slate-900">数据字典</div>
              <div class="text-xs text-slate-500">维护项目类型、图层分类和系统枚举</div>
            </div>
          </div>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" :disabled="isLoading" @click="loadData">
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
            </Button>
            <Button variant="ghost" size="sm" @click="emit('close')"><X class="w-4 h-4" /></Button>
          </div>
        </header>

        <main class="flex-1 min-h-0 grid grid-cols-[1fr_320px]">
          <section class="min-h-0 flex flex-col border-r">
            <div class="p-3 border-b">
              <Select v-model="dictionaryType" :options="typeOptions" @update:model-value="loadData" />
            </div>
            <div class="flex-1 overflow-auto p-4 grid grid-cols-2 gap-4">
              <div>
                <div class="text-sm font-semibold text-slate-700 mb-2">维护项</div>
                <div class="border rounded divide-y overflow-hidden bg-white">
                  <button v-for="item in dictionaries" :key="`${item.type}-${item.id}`" class="w-full text-left px-3 py-2 hover:bg-blue-50" @click="editItem(item)">
                    <div class="font-medium text-sm text-slate-800">{{ item.name || item.code }}</div>
                    <div class="text-xs text-slate-500">{{ item.code }} · {{ item.isValidCd === '1' ? '启用' : '停用' }}</div>
                  </button>
                  <div v-if="!isLoading && dictionaries.length === 0" class="p-6 text-center text-sm text-slate-400">暂无字典项</div>
                </div>
              </div>
              <div>
                <div class="text-sm font-semibold text-slate-700 mb-2">业务可选项</div>
                <div class="border rounded divide-y overflow-hidden bg-white">
                  <div v-for="item in selectableItems" :key="`${item.type}-${item.code}`" class="px-3 py-2">
                    <div class="font-medium text-sm text-slate-800">{{ item.name || item.code }}</div>
                    <div class="text-xs text-slate-500">{{ item.code }}</div>
                  </div>
                  <div v-if="!isLoading && selectableItems.length === 0" class="p-6 text-center text-sm text-slate-400">暂无可选项</div>
                </div>
              </div>
            </div>
          </section>

          <aside class="p-4 space-y-3 bg-slate-50">
            <div class="font-semibold text-slate-800">字典项</div>
            <Select v-model="form.type" :options="typeOptions" />
            <Input v-model="form.code" placeholder="编码" />
            <Input v-model="form.name" placeholder="名称" />
            <Input v-model="form.detail" placeholder="说明" />
            <Input v-model="form.sortNum" type="number" placeholder="排序" />
            <Select v-model="form.isValidCd" :options="[{ value: '1', label: '启用' }, { value: '0', label: '停用' }]" />
            <div class="flex gap-2">
              <Button class="flex-1" :disabled="isLoading" @click="saveItem"><Save class="w-4 h-4 mr-1" />保存</Button>
              <Button variant="outline" @click="resetForm">新建</Button>
              <Button v-if="form.id" variant="destructive" @click="removeItem(form as PlatformDictionary)"><Trash2 class="w-4 h-4" /></Button>
            </div>
          </aside>
        </main>
      </div>
    </div>
  </Teleport>
</template>
