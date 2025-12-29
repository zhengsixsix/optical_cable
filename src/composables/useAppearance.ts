const APPEARANCE_STORAGE_KEY = 'app_appearance_settings'

export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'blue'
  primaryColor: string
  fontFamily: string
  fontSize: number
}

const defaultSettings: AppearanceSettings = {
  theme: 'light',
  primaryColor: '#2563eb',
  fontFamily: 'Microsoft YaHei',
  fontSize: 14,
}

// 主题配色方案
const themeColors = {
  light: {
    primaryColor: '#2563eb',
    bgColor: '#f0f2f5',
    bgSecondary: '#ffffff',
    textColor: '#1f2937',
    textSecondary: '#6b7280',
    borderColor: '#e5e7eb',
    headerBg: '#003366',
    headerText: '#ffffff',
    sidebarBg: '#ffffff',
    cardBg: '#ffffff',
  },
  dark: {
    primaryColor: '#3b82f6',
    bgColor: '#111827',
    bgSecondary: '#1f2937',
    textColor: '#f9fafb',
    textSecondary: '#9ca3af',
    borderColor: '#374151',
    headerBg: '#0f172a',
    headerText: '#f1f5f9',
    sidebarBg: '#1f2937',
    cardBg: '#1f2937',
  },
  blue: {
    primaryColor: '#0ea5e9',
    bgColor: '#f0f9ff',
    bgSecondary: '#ffffff',
    textColor: '#0c4a6e',
    textSecondary: '#0369a1',
    borderColor: '#bae6fd',
    headerBg: '#0369a1',
    headerText: '#ffffff',
    sidebarBg: '#f0f9ff',
    cardBg: '#ffffff',
  },
}

const hexToRgb = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (result) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
  }
  return '37, 99, 235'
}

export function loadAppearanceSettings(): AppearanceSettings {
  try {
    const saved = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) }
    }
  } catch (error) {
    console.error('加载外观设置失败:', error)
  }
  return defaultSettings
}

export function applyAppearanceSettings(settings: AppearanceSettings) {
  const root = document.documentElement
  const colors = themeColors[settings.theme]

  // 应用主题类
  root.classList.remove('theme-light', 'theme-dark', 'theme-blue')
  root.classList.add(`theme-${settings.theme}`)

  // Toggle 'dark' class for Tailwind dark mode
  if (settings.theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  // 直接设置所有 CSS 变量值
  root.style.setProperty('--app-primary-color', settings.primaryColor || colors.primaryColor)
  root.style.setProperty('--app-primary-rgb', hexToRgb(settings.primaryColor || colors.primaryColor))
  root.style.setProperty('--app-bg-color', colors.bgColor)
  root.style.setProperty('--app-bg-secondary', colors.bgSecondary)
  root.style.setProperty('--app-text-color', colors.textColor)
  root.style.setProperty('--app-text-secondary', colors.textSecondary)
  root.style.setProperty('--app-border-color', colors.borderColor)
  root.style.setProperty('--app-header-bg', colors.headerBg)
  root.style.setProperty('--app-header-text', colors.headerText)
  root.style.setProperty('--app-sidebar-bg', colors.sidebarBg)
  root.style.setProperty('--app-card-bg', colors.cardBg)

  // 应用字体
  const fontStack = `'${settings.fontFamily}', 'Helvetica Neue', Helvetica, 'PingFang SC', Arial, sans-serif`
  root.style.setProperty('--app-font-family', fontStack)

  // 应用字体大小
  root.style.setProperty('--app-font-size', `${settings.fontSize}px`)

  console.log('[Appearance] 主题已应用:', settings.theme, colors)
}

export function initAppearance() {
  const settings = loadAppearanceSettings()
  applyAppearanceSettings(settings)
  console.log('[Appearance] 初始化完成:', settings)
}
