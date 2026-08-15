import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

// vite-plugin-electron 的主进程/预加载构建不会加载根配置（内部 configFile=false），
// 根配置里的 resolve.alias 不会自动继承，必须显式注入到每个 entry 的 vite 配置
const electronAlias = {
  '@': resolve(import.meta.dirname, 'src'),
  '@electron': resolve(import.meta.dirname, 'electron'),
}

export default defineConfig({
  server: {
    port: 5174,
  },
  plugins: [
    vue(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          resolve: {
            alias: electronAlias,
          },
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          resolve: {
            alias: electronAlias,
          },
          build: {
            outDir: 'dist-electron',
            minify: false,
            lib: {
              formats: ['cjs'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: electronAlias,
  },
  build: {
    outDir: 'dist',
  },
})
