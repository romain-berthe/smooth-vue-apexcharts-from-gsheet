import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  // Load all envs (no prefix filter) so we can debug and forward them
  const env = loadEnv(mode, __dirname, '')
  return {
    // Force Vite to treat this directory as root for env loading
    root: __dirname,
    envDir: __dirname,
    envPrefix: 'VITE_',
    define: {
      __APP_ENV__: JSON.stringify(env),
    },
    plugins: [vue()],
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
