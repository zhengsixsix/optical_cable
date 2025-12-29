<script setup lang="ts">
import { ref, watch } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { X, Palette } from 'lucide-vue-next'
import { useAppStore } from '@/stores'
import { loadAppearanceSettings, applyAppearanceSettings, type AppearanceSettings } from '@/composables'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const appStore = useAppStore()
const APPEARANCE_STORAGE_KEY = 'app_appearance_settings'

type ThemeType = 'light' | 'dark' | 'blue'

const selectedTheme = ref<ThemeType>('light')
const customPrimaryColor = ref('#2563eb')
const customFontFamily = ref('Microsoft YaHei')
const customFontSize = ref(14)

const fontOptions = [
  { value: 'Microsoft YaHei', label: '微软雅黑' },
  { value: 'SimSun', label: '宋体' },
  { value: 'SimHei', label: '黑体' },
  { value: 'KaiTi', label: '楷体' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
]

const loadSettings = () => {
  const settings = loadAppearanceSettings()
  selectedTheme.value = settings.theme
  customPrimaryColor.value = settings.primaryColor
  customFontFamily.value = settings.fontFamily
  customFontSize.value = settings.fontSize
}

const saveAndApply = () => {
  const settings: AppearanceSettings = {
    theme: selectedTheme.value,
    primaryColor: customPrimaryColor.value,
    fontFamily: customFontFamily.value,
    fontSize: customFontSize.value,
  }
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings))
  applyAppearanceSettings(settings)
}

const applyTheme = () => {
  saveAndApply()
}

const applyCustomSettings = () => {
  saveAndApply()
  appStore.showNotification({ type: 'success', message: '外观设置已应用' })
}

// 主题默认配色
const themeDefaultColors: Record<ThemeType, string> = {
  light: '#2563eb',
  dark: '#3b82f6',
  blue: '#0ea5e9',
}

const isLoading = ref(false)

watch(selectedTheme, (newTheme) => {
  if (isLoading.value) return
  // 切换主题时，同步重置主色调为该主题的默认色
  customPrimaryColor.value = themeDefaultColors[newTheme]
  applyTheme()
})

watch(() => props.visible, (val) => {
  if (val) {
    isLoading.value = true
    loadSettings()
    // Use nextTick or timeout to allow watcher to fire (and be ignored) before resetting flag
    setTimeout(() => {
      isLoading.value = false
    }, 0)
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')">
      <Card class="w-[480px] shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b">
          <div class="flex items-center gap-2">
            <Palette class="w-5 h-5 text-blue-600" />
            <span class="font-semibold text-lg">外观设置</span>
          </div>
          <Button variant="ghost" size="sm" @click="emit('close')">
            <X class="w-4 h-4" />
          </Button>
        </CardHeader>

        <CardContent class="p-6 space-y-6">
          <!-- 主题选择 -->
          <div class="space-y-3">
            <div class="flex items-center gap-6">
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="selectedTheme" type="radio" value="light" name="theme" class="w-4 h-4 accent-blue-600">
                <span class="text-sm text-gray-700">浅色主题</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="selectedTheme" type="radio" value="dark" name="theme" class="w-4 h-4 accent-blue-600">
                <span class="text-sm text-gray-700">深色主题</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="selectedTheme" type="radio" value="blue" name="theme" class="w-4 h-4 accent-blue-600">
                <span class="text-sm text-gray-700">蓝色主题</span>
              </label>
            </div>
          </div>

          <!-- 自定义主题 -->
          <div class="space-y-4">
            <h4 class="font-medium text-gray-800">自定义主题</h4>

            <!-- 主色调 -->
            <div class="space-y-2">
              <label class="text-sm text-gray-600">主色调:</label>
              <div class="flex items-center gap-2">
                <input v-model="customPrimaryColor" type="color"
                  class="w-full h-9 cursor-pointer border border-gray-300 rounded">
              </div>
            </div>

            <!-- 字体风格 -->
            <div class="space-y-2">
              <label class="text-sm text-gray-600">字体风格:</label>
              <select v-model="customFontFamily"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                <option v-for="font in fontOptions" :key="font.value" :value="font.value">
                  {{ font.label }}
                </option>
              </select>
            </div>

            <!-- 字体大小 -->
            <div class="space-y-2">
              <label class="text-sm text-gray-600">字体大小 (px):</label>
              <input v-model.number="customFontSize" type="number" min="12" max="24"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
            </div>

            <!-- 应用按钮 -->
            <Button class="w-full" @click="applyCustomSettings">
              应用并保存自定义主题
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </Teleport>
</template>
