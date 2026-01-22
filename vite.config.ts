import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

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
  },
  build: {
    rollupOptions: {
      output: {
        // 避免中文 chunk 名
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks(id) {
          // 将中文命名的模块合并到 vendor
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        }
      }
    }
  },
})
