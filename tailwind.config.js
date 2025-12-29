/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 主色调 - 匹配原 Element Plus 和原型设计
        // 主色调 - 使用 CSS 变量支持动态换肤
        primary: {
          DEFAULT: "rgb(var(--app-primary-rgb) / <alpha-value>)",
          foreground: "#ffffff",
          50: "rgb(var(--app-primary-rgb) / 0.05)",
          100: "rgb(var(--app-primary-rgb) / 0.1)",
          200: "rgb(var(--app-primary-rgb) / 0.2)",
          300: "rgb(var(--app-primary-rgb) / 0.3)",
          400: "rgb(var(--app-primary-rgb) / 0.5)",
          500: "rgb(var(--app-primary-rgb) / 0.6)", // 对应原来的 400/500
          600: "rgb(var(--app-primary-rgb) / 0.8)",
          700: "rgb(var(--app-primary-rgb) / <alpha-value>)", // 默认主色
          800: "rgb(var(--app-primary-rgb) / 0.9)",
          900: "rgb(var(--app-primary-rgb) / 1)",
        },
        // 深蓝色 - 用于 header
        navy: {
          DEFAULT: "#003366",
          dark: "#002244",
          light: "#1956a6",
        },
        // 状态颜色
        success: {
          DEFAULT: "#67C23A",
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#E6A23C",
          foreground: "#ffffff",
        },
        danger: {
          DEFAULT: "#F56C6C",
          foreground: "#ffffff",
        },
        // 背景和边框
        background: "#ffffff",
        foreground: "#303133",
        muted: {
          DEFAULT: "#f5f7fa",
          foreground: "#909399",
        },
        border: "#dcdfe6",
        input: "#dcdfe6",
        ring: "#165DFF",
        // 面板卡片
        card: {
          DEFAULT: "#ffffff",
          foreground: "#303133",
        },
        // 弹出层
        popover: {
          DEFAULT: "#ffffff",
          foreground: "#303133",
        },
      },
      borderRadius: {
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
      fontSize: {
        xs: ["calc(var(--app-font-size) - 2px)", "1.2"],
        sm: ["calc(var(--app-font-size) - 1px)", "1.4"],
        base: ["var(--app-font-size)", "1.5"],
        lg: ["calc(var(--app-font-size) + 2px)", "1.5"],
        xl: ["calc(var(--app-font-size) + 4px)", "1.5"],
        "2xl": ["calc(var(--app-font-size) + 6px)", "1.5"],
        "3xl": ["calc(var(--app-font-size) + 10px)", "1.5"],
      },
      boxShadow: {
        sm: "0 1px 3px rgba(0, 0, 0, 0.1)",
        DEFAULT: "0 2px 4px rgba(0, 0, 0, 0.1)",
        md: "0 4px 12px rgba(0, 0, 0, 0.15)",
        lg: "0 5px 15px rgba(0, 0, 0, 0.2)",
      },
    },
  },
  plugins: [],
}
