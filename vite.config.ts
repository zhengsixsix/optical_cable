import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const PLATFORM_PROXY_PATH = '/platform-api'
const platformProxy = {
  target: 'http://47.92.110.176:9108',
  changeOrigin: true,
  secure: false,
  rewrite: (path: string) => path.replace(new RegExp(`^${PLATFORM_PROXY_PATH}`), ''),
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 4395,
    host: '0.0.0.0',
    open: true,
    allowedHosts: true,
    proxy: {
      [PLATFORM_PROXY_PATH]: platformProxy,
    },
  },
  preview: {
    proxy: {
      [PLATFORM_PROXY_PATH]: platformProxy,
    },
  },
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: {
          // Vue 核心
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          // 地图库（约 400KB）
          'vendor-map': ['ol'],
          // 3D 渲染（约 600KB）
          'vendor-3d': ['three'],
          // UI 组件库
          'vendor-ui': ['radix-vue', 'lucide-vue-next'],
          // 数据处理
          'vendor-data': ['exceljs', 'jszip', 'xlsx'],
          // 地理数据
          'vendor-geo': ['geotiff', 'shpjs'],
        },
      },
    },
    // 优化构建
    target: 'esnext',
    minify: 'esbuild',
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 资源内联阈值
    assetsInlineLimit: 4096,
  },
  // 依赖预构建优化
  optimizeDeps: {
    include: ['vue', 'vue-router', 'pinia', 'ol', 'three'],
  },
})

