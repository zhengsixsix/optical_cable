import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const PLATFORM_PROXY_PATH = '/platform-api'
const PLATFORM_PROXY_TARGET = 'http://47.92.110.176:9108'

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
      [PLATFORM_PROXY_PATH]: {
        target: PLATFORM_PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        rewrite: (path: string) => path.replace(new RegExp(`^${PLATFORM_PROXY_PATH}`), ''),
      },
    },
  },
  preview: {
    proxy: {
      [PLATFORM_PROXY_PATH]: {
        target: PLATFORM_PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        rewrite: (path: string) => path.replace(new RegExp(`^${PLATFORM_PROXY_PATH}`), ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-map': ['ol'],
          'vendor-3d': ['three'],
          'vendor-ui': ['radix-vue', 'lucide-vue-next'],
          'vendor-data': ['exceljs', 'jszip', 'xlsx'],
          'vendor-geo': ['shpjs'],
        },
      },
    },
    target: 'esnext',
    minify: 'esbuild',
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
  },
  optimizeDeps: {
    include: ['vue', 'vue-router', 'pinia', 'ol', 'three'],
  },
})
