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
        primary: {
          DEFAULT: "#409EFF",
          foreground: "#ffffff",
          50: "#ecf5ff",
          100: "#d9ecff",
          200: "#c6e2ff",
          300: "#a0cfff",
          400: "#79bbff",
          500: "#409EFF",
          600: "#337ecc",
          700: "#265eb8",
          800: "#193e8f",
          900: "#0d2066",
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
        xs: ["12px", "16px"],
        sm: ["13px", "18px"],
        base: ["14px", "20px"],
        lg: ["16px", "24px"],
        xl: ["18px", "28px"],
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
