import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const PLATFORM_PROXY_PATH = '/platform-api'
const DEFAULT_PLATFORM_PROXY_TARGET = 'http://47.92.110.176:9108'
const GEOSERVER_PROXY_PATH = '/geoserver'
const DEFAULT_GEOSERVER_PROXY_TARGET = 'http://47.92.110.176:8960'
const DEFAULT_DEV_HOST = '0.0.0.0'
const DEFAULT_DEV_PORT = 4395

function parsePort(value: string | undefined): number {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_DEV_PORT
}

function parseOpen(value: string | undefined): boolean | string {
  const normalized = value?.trim()
  if (!normalized) return true
  if (normalized.toLowerCase() === 'true') return true
  if (normalized.toLowerCase() === 'false') return false
  return normalized
}

function parseAllowedHosts(value: string | undefined): true | string[] {
  const normalized = value?.trim()
  if (!normalized || normalized.toLowerCase() === 'true') return true
  if (normalized.toLowerCase() === 'false') return []
  return normalized.split(',').map(host => host.trim()).filter(Boolean)
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const platformProxyTarget = env.VITE_PLATFORM_PROXY_TARGET || DEFAULT_PLATFORM_PROXY_TARGET
  const geoserverProxyTarget = env.VITE_GEOSERVER_PROXY_TARGET || DEFAULT_GEOSERVER_PROXY_TARGET

  const proxy = {
    [PLATFORM_PROXY_PATH]: {
      target: platformProxyTarget,
      changeOrigin: true,
      secure: false,
      rewrite: (path: string) => path.replace(new RegExp(`^${PLATFORM_PROXY_PATH}`), ''),
    },
    [GEOSERVER_PROXY_PATH]: {
      target: geoserverProxyTarget,
      changeOrigin: true,
      secure: false,
      rewrite: (path: string) => path.replace(new RegExp(`^${GEOSERVER_PROXY_PATH}`), ''),
    },
  }

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      port: parsePort(env.VITE_DEV_PORT),
      host: env.VITE_DEV_HOST || DEFAULT_DEV_HOST,
      open: parseOpen(env.VITE_DEV_OPEN),
      allowedHosts: parseAllowedHosts(env.VITE_DEV_ALLOWED_HOSTS),
      proxy,
    },
    preview: {
      proxy,
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
  }
})
