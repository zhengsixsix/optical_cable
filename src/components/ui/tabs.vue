<script setup lang="ts">
import { computed } from 'vue'
import {
  TabsRoot,
  TabsList,
  TabsTrigger,
  TabsContent,
} from 'radix-vue'
import { cn } from '@/lib/utils'

/**
 * Tabs 选项卡组件
 * 基于 radix-vue 实现的选项卡
 */
interface TabItem {
  value: string
  label: string
  disabled?: boolean
}

interface Props {
  modelValue?: string
  defaultValue?: string
  tabs: TabItem[]
  orientation?: 'horizontal' | 'vertical'
}

const props = withDefaults(defineProps<Props>(), {
  orientation: 'horizontal'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const activeTab = computed({
  get: () => props.modelValue ?? props.defaultValue ?? props.tabs[0]?.value,
  set: (value) => emit('update:modelValue', value)
})
</script>

<template>
  <TabsRoot
    v-model="activeTab"
    :default-value="defaultValue"
    :orientation="orientation"
    :class="cn(
      'flex',
      orientation === 'horizontal' ? 'flex-col' : 'flex-row'
    )"
  >
    <!-- 选项卡列表 -->
    <TabsList
      :class="cn(
        'flex bg-gray-100 rounded-lg p-1',
        orientation === 'horizontal' ? 'flex-row' : 'flex-col w-48 shrink-0'
      )"
    >
      <TabsTrigger
        v-for="tab in tabs"
        :key="tab.value"
        :value="tab.value"
        :disabled="tab.disabled"
        :class="cn(
          'px-4 py-2 text-sm font-medium transition-all rounded-md',
          'data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm',
          'data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:text-gray-900',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          orientation === 'horizontal' ? 'flex-1' : 'w-full text-left'
        )"
      >
        {{ tab.label }}
      </TabsTrigger>
    </TabsList>

    <!-- 内容区域 -->
    <div :class="cn(
      'flex-1',
      orientation === 'horizontal' ? 'mt-4' : 'ml-4'
    )">
      <TabsContent
        v-for="tab in tabs"
        :key="tab.value"
        :value="tab.value"
        class="outline-none"
      >
        <slot :name="tab.value" />
      </TabsContent>
    </div>
  </TabsRoot>
</template>
